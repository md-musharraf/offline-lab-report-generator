import { NextResponse } from 'next/server';
import { PrismaClient } from '../../../prisma/client';

const prisma = new PrismaClient();

async function resolveValidUserId(validIds: number[], superAdminId: number | null, providedId: number): Promise<number> {
  if (providedId && validIds.includes(Number(providedId))) {
    return Number(providedId);
  }
  if (superAdminId) {
    return superAdminId;
  }
  if (validIds.length > 0) {
    return validIds[0]!;
  }
  return providedId;
}

async function sanitizeUserIds(validIds: number[], superAdminId: number | null, obj: any): Promise<any> {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = await sanitizeUserIds(validIds, superAdminId, obj[i]);
    }
    return obj;
  }
  const userFields = ['userId', 'createdBy', 'receivedBy', 'enteredBy', 'verifiedBy', 'approvedBy'];
  for (const key of Object.keys(obj)) {
    if (userFields.includes(key)) {
      const val = obj[key];
      if (val !== null && val !== undefined && (typeof val === 'number' || typeof val === 'string')) {
        const intVal = parseInt(val as string, 10);
        if (!isNaN(intVal)) {
          obj[key] = await resolveValidUserId(validIds, superAdminId, intVal);
        }
      }
    } else {
      obj[key] = await sanitizeUserIds(validIds, superAdminId, obj[key]);
    }
  }
  return obj;
}

export async function POST(request: Request) {
  let model = '';
  let action = '';
  let args: any = null;

  try {
    const body = await request.json();
    model = body.model;
    action = body.action;
    args = body.args;

    if (!model || !action) {
      return NextResponse.json({ success: false, error: 'Model and action are required' }, { status: 400 });
    }

    // Fetch valid user IDs to map any invalid foreign key references
    let validIds: number[] = [];
    let superAdminId: number | null = null;
    try {
      const users = await prisma.user.findMany({ select: { id: true, role: true } });
      validIds = users.map(u => u.id);
      const admin = users.find(u => u.role === 'SUPER_ADMIN');
      if (admin) {
        superAdminId = admin.id;
      }
    } catch (err) {
      console.error('Error pre-fetching users for ID sanitization:', err);
    }

    if (args) {
      args = await sanitizeUserIds(validIds, superAdminId, args);
    }

    // Intercept user model creates and updates to hash plain text passwords
    if (model === 'user' && (action === 'create' || action === 'update') && args?.data?.password) {
      const bcrypt = require('bcryptjs');
      if (!args.data.password.startsWith('$2a$') && !args.data.password.startsWith('$2b$')) {
        args.data.password = await bcrypt.hash(args.data.password, 12);
      }
    }

    // Intercept labSettings model creates, updates, and upserts to convert base64 images to Buffer
    if (model === 'labSettings' && (action === 'create' || action === 'update' || action === 'upsert')) {
      const convertBase64ToBuffer = (val: any) => {
        if (!val) return null;
        if (typeof val === 'string') {
          if (val.startsWith('data:image')) {
            const base64Data = val.split(';base64,').pop();
            return Buffer.from(base64Data!, 'base64');
          }
          return Buffer.from(val, 'base64');
        }
        return val;
      };

      const fieldsToConvert = ['logo', 'signature', 'technicianSignature', 'pathologyDoctorSignature'];

      if (args) {
        if (args.data) {
          fieldsToConvert.forEach(field => {
            if (args.data[field] !== undefined) {
              args.data[field] = convertBase64ToBuffer(args.data[field]);
            }
          });
        }
        if (args.create) {
          fieldsToConvert.forEach(field => {
            if (args.create[field] !== undefined) {
              args.create[field] = convertBase64ToBuffer(args.create[field]);
            }
          });
        }
        if (args.update) {
          fieldsToConvert.forEach(field => {
            if (args.update[field] !== undefined) {
              args.update[field] = convertBase64ToBuffer(args.update[field]);
            }
          });
        }
      }
    }

    // Intercept test model creates and updates to handle nested parameter objects in SQLite/Prisma
    if (model === 'test' && (action === 'create' || action === 'update')) {
      const { parameters, ...testData } = args.data || {};
      if (parameters) {
        if (action === 'create') {
          const result = await prisma.test.create({
            data: {
              ...testData,
              parameters: {
                create: parameters.map((p: any, pIdx: number) => ({
                  name: p.name,
                  unit: p.unit || null,
                  sortOrder: p.sortOrder || (pIdx + 1),
                  type: p.type || 'NUMERIC',
                  options: p.options || null,
                  isHeader: p.isHeader || false,
                  refRanges: {
                    create: (p.refRanges || []).map((r: any) => ({
                      gender: r.gender || null,
                      normalMin: r.normalMin !== undefined && r.normalMin !== '' && r.normalMin !== null ? Number(r.normalMin) : null,
                      normalMax: r.normalMax !== undefined && r.normalMax !== '' && r.normalMax !== null ? Number(r.normalMax) : null,
                      criticalMin: r.criticalMin !== undefined && r.criticalMin !== '' && r.criticalMin !== null ? Number(r.criticalMin) : null,
                      criticalMax: r.criticalMax !== undefined && r.criticalMax !== '' && r.criticalMax !== null ? Number(r.criticalMax) : null,
                      textNormal: r.textNormal || null
                    }))
                  }
                }))
              }
            },
            include: { category: true, parameters: { include: { refRanges: true } } }
          });
          return NextResponse.json({ success: true, data: result });
        } else if (action === 'update') {
          const testId = args.where.id;

          // Clear existing parameters and reference ranges
          const existingParams = await prisma.testParameter.findMany({ where: { testId } });
          for (const p of existingParams) {
            await prisma.referenceRange.deleteMany({ where: { parameterId: p.id } });
          }
          await prisma.testParameter.deleteMany({ where: { testId } });

          // Update test record & recreate parameters
          const result = await prisma.test.update({
            where: { id: testId },
            data: {
              ...testData,
              parameters: {
                create: parameters.map((p: any, pIdx: number) => ({
                  name: p.name,
                  unit: p.unit || null,
                  sortOrder: p.sortOrder || (pIdx + 1),
                  type: p.type || 'NUMERIC',
                  options: p.options || null,
                  isHeader: p.isHeader || false,
                  refRanges: {
                    create: (p.refRanges || []).map((r: any) => ({
                      gender: r.gender || null,
                      normalMin: r.normalMin !== undefined && r.normalMin !== '' && r.normalMin !== null ? Number(r.normalMin) : null,
                      normalMax: r.normalMax !== undefined && r.normalMax !== '' && r.normalMax !== null ? Number(r.normalMax) : null,
                      criticalMin: r.criticalMin !== undefined && r.criticalMin !== '' && r.criticalMin !== null ? Number(r.criticalMin) : null,
                      criticalMax: r.criticalMax !== undefined && r.criticalMax !== '' && r.criticalMax !== null ? Number(r.criticalMax) : null,
                      textNormal: r.textNormal || null
                    }))
                  }
                }))
              }
            },
            include: { category: true, parameters: { include: { refRanges: true } } }
          });
          return NextResponse.json({ success: true, data: result });
        }
      }
    }

    if (!(prisma as any)[model] || !(prisma as any)[model][action]) {
      return NextResponse.json({ success: false, error: `Invalid Prisma model or action: ${model}.${action}` }, { status: 400 });
    }

    const result = await (prisma as any)[model][action](args || {});
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error(`API DB Error (${model}.${action}):`, error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
