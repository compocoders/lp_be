import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const prisma = new PrismaClient();

async function main() {
    const room = await prisma.classroom.findUnique({
        where: { roomCode: 'RMQDUS' },
        include: {
            classroomUsers: true
        }
    });
    console.log(JSON.stringify(room, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
