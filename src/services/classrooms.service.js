import { prisma } from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

//get rooms by code
export const getRoomsbyCode = async (code) => {

    const rooms = await prisma.classroom.findMany({
        where: {
            roomCode: code,
        },
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
            classroomUsers: {
                select: {
                    userId: true,
                    role: true,
                    User: {
                        select: {
                            profile: {
                                select: {
                                    firstName: true,
                                    lastName: true,
                                    profilePicture: true,
                                }
                            }
                        }
                    }
                }
            }
        }
    });
    if (rooms.length === 0) throw new Error('No rooms found with the provided code');
    if(rooms[0].status === 'DELETED') throw new Error('This class is not available');
    return rooms;
}

//create room links
export const roomLink = async (code) => {

    const room = await prisma.classroom.findUnique({
        where: {
            roomCode: code,
        }
    });
    if (!room) throw new Error('No room found with the provided code');
    if(room.status === 'DELETED') throw new Error('This class is not available');
    return room;
}


//get rooms by user id
export const getRoomsbyUserId = async (userId) => {
    const rooms = await prisma.classroom.findMany({
        where: { userId },
    });
    return rooms;
}


//get rooms that user joined by user id
export const getRoomsbyUserJoined = async (userId) => {
    const rooms = await prisma.classroomUser.findMany({
        where: { userId },
        include: {
            Classroom: true
        }
    });
    return rooms.map((entry) => entry.Classroom);
}

//create rooms
export const createRooms = async (data) => {
    const generateRoomCode = () => {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    }

    const hashedPassword = data.roomPassword ? await bcrypt.hash(data.roomPassword, 10) : null;

    // We use a transaction so if the user creation fails, the room isn't created either
    const [room, classRoomUser] = await prisma.$transaction(async (tx) => {
        if (data.private && !data.roomPassword) {
            throw new Error('Private rooms must have a password');
        }
        if (!data.private && data.roomPassword) {
            throw new Error('Public rooms cannot have a password');
        }
        const newRoom = await tx.classroom.create({
            data: {
                name: data.name,
                roomCode: generateRoomCode(),
                description: data.description,
                userId: data.userId, // Ensure this exists in your data object!
                status: data.status || 'ACTIVE', // Good idea to have a default
                private: data.private,
                roompassword: hashedPassword
            }
        });
        
        const newUser = await tx.classroomUser.create({ // Fixed capitalization here
            data: {
                userId: data.userId,
                classroomId: newRoom.id,
                role: 'OWNER'
            }
        });
        
        return [newRoom, newUser];
    });

    return [room, classRoomUser];
}

//update rooms
export const updateRooms = async (id, data, requestingUserId) => {
    // We must pass the requestingUserId from the controller to verify ownership
    const room = await prisma.classroom.findUnique({ where: { id } });
    
    if (!room) throw new Error('Room not found');
    if (room.userId !== requestingUserId) throw new Error('Unauthorized'); // Fixed logic

    let newHashedPassword = undefined;

    if (data.private) {
        // If it's private, we need a password.
        if (!room.roompassword && !data.roomPassword) {
            throw new Error('A password is required when making a room private.');
        }

        if (data.roomPassword) {
            // Changing or setting the password
            if (room.roompassword) {
                // If there's an existing password, they must provide oldPassword
                if (!data.oldPassword) {
                    throw new Error('You must provide the previous password to change it.');
                }
                const passwordMatch = await bcrypt.compare(data.oldPassword, room.roompassword);
                if (!passwordMatch) {
                    throw new Error('Incorrect previous password.');
                }
            }
            newHashedPassword = await bcrypt.hash(data.roomPassword, 10);
        }
    } else {
        // If making public, maybe clear the password? The requirement doesn't explicitly say so, but it's good practice.
        newHashedPassword = null;
    }
    
    const updatedRoom = await prisma.classroom.update({
        where: { id: id },
        data: {
            name: data.name,
            description: data.description,
            status: data.status,
            private: data.private,
            ...(newHashedPassword !== undefined && { roompassword: newHashedPassword }) 
        }
    });
    return updatedRoom;
}

//delete rooms (soft delete by changing status)
export const deleteRooms = async (id, requestingUserId) => {
    const room = await prisma.classroom.findUnique({ where: { id } });
    
    if (!room) throw new Error('Room not found');
    if (room.userId !== requestingUserId) throw new Error('Unauthorized'); // Fixed logic

    // Soft delete: Update the status instead of dropping the row entirely
    const deletedRoom = await prisma.classroom.update({
        where: { id: id },
        data: { status: 'DELETED' }
    });
    return deletedRoom;
}

// Generate invite token (JWT) for a classroom
export const generateInviteToken = async (classroomId, requestingUserId) => {
    const room = await prisma.classroom.findUnique({ where: { id: classroomId } });
    if (!room) throw new Error('Room not found');
    if (room.userId !== requestingUserId) throw new Error('Unauthorized: Only the owner can generate an invite link');

    const token = jwt.sign({ classroomId }, env.JWT_SECRET, { expiresIn: '24h' });
    return token;
}

// Join a room using an invite token
export const joinRoomWithToken = async (token, userId, roompassword) => {
    try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        const classroomId = decoded.classroomId;

        // Fetch room details and check membership concurrently for efficiency
        const [room, existingMember] = await Promise.all([
            prisma.classroom.findUnique({ where: { id: classroomId } }),
            prisma.classroomUser.findFirst({ where: { classroomId, userId } })
        ]);

        if (!room) throw new Error('Room not found');
        if (room.status === 'DELETED') throw new Error('This class is no longer available');

        if (existingMember) {
            throw new Error('You already joined this room');
        }

        if (room.private) {
            if (!room.roompassword) {
                throw new Error('This room is private but has no password set. Contact the administrator.');
            }
            if (!roompassword) {
                throw new Error('Room password is required to join a private room');
            }
            
            const passwordMatch = await bcrypt.compare(roompassword, room.roompassword);
            if (!passwordMatch) {
                throw new Error('Incorrect room password');
            }
        }

        const newMember = await prisma.classroomUser.create({
            data: {
                userId,
                classroomId,
                role: 'student'
            }
        });

        return newMember;
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            throw new Error('Invite link has expired');
        } else if (err.name === 'JsonWebTokenError') {
            throw new Error('Invalid invite link');
        } else if (err.code === 'P2002') {
            throw new Error('You already joined this room');
        }
        throw err;
    }
}

// Leave a room
export const leaveRoom = async (classroomId, userId) => {
    const membership = await prisma.classroomUser.findFirst({
        where: { classroomId, userId }
    });

    if (!membership) {
        throw new Error('You are not a member of this room');
    }

    if (membership.role === 'OWNER') {
        throw new Error('Owners cannot leave their own room, they can only delete it');
    }

    await prisma.classroomUser.delete({
        where: { id: membership.id }
    });

    return { message: 'Successfully left the room' };
}