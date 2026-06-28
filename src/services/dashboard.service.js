import { prisma } from '../config/db.js';

export const getDashboardData = async (userId) => {
    const userdata = await prisma.user.findUnique({
        where: { id: userId },
        select: { 
            id: true,
            email: true,
            virtualTokens: true,
            profile: {
                select: {
                    profilePicture: true,
                    firstName: true,
                    lastName: true,
                }
            },
        }

       
    });

    const classroomsResponse = await prisma.classroomUser.findMany({
            where: { userId },
            include: {
                Classroom: {
                    include: {
                        User: {
                            select: {
                                profile: {
                                    select: {
                                        firstName: true,
                                        lastName: true,
                                    }
                                }
                            }
                        },
                        activities: {
                            where: { status: 'published' },
                            select: {
                                id: true,
                                title: true,
                                deadline: true,
                                submissions: {
                                    where: { studentId: userId },
                                    select: { id: true }
                                }
                            },
                            orderBy: {
                                deadline: 'asc'
                            }
                        }
                    }
                }
            }
    });

    return { ...userdata, classrooms: classroomsResponse.map((item) => item.Classroom) };
};  