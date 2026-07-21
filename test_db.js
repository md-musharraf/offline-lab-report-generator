const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Retrieving users...');
  const users = await prisma.user.findMany();
  console.log('Users in database:', users);
  
  console.log('Retrieving patients...');
  const patientsCount = await prisma.patient.count();
  console.log('Patients count:', patientsCount);

  console.log('Retrieving doctors...');
  const doctors = await prisma.doctor.findMany();
  console.log('Doctors:', doctors.map(d => ({ id: d.id, name: d.name, isActive: d.isActive })));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
