const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tests = await prisma.test.findMany({
    include: {
      parameters: {
        include: { refRanges: true }
      }
    }
  });
  console.log('Tests found:', tests.length);
  if (tests.length > 0) {
    console.log('First test details:', {
      name: tests[0].name,
      parametersCount: tests[0].parameters.length,
      firstParamRangesCount: tests[0].parameters[0]?.refRanges.length || 0
    });
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
