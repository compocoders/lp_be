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
    console.log("Room userId:", room.userId);
    console.log("Classroom Users:");
    console.log(room.classroomUsers);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
