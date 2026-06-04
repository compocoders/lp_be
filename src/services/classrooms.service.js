import { prisma } from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const getRoomsbyCode = async (code) => {

    const rooms = await prisma.classroom.findMany({
        where: {
            roomCode: code,
        }
    });
    if (rooms.length === 0) throw new Error('No rooms found with the provided code');
    if(rooms[0].status === 'DELETED') throw new Error('This class is not available');
    return rooms;
}
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
export const getRoomsbyUserId = async (userId) => {
    const rooms = await prisma.classroom.findMany({
        where: {
            userId: userId
        }
    });
    return rooms;
}

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

export const updateRooms = async (id, data, requestingUserId) => {
    // We must pass the requestingUserId from the controller to verify ownership
    const room = await prisma.classroom.findUnique({ where: { id } });
    
    if (!room) throw new Error('Room not found');
    if (room.userId !== requestingUserId) throw new Error('Unauthorized'); // Fixed logic

    const hashedPassword = data.roomPassword ? await bcrypt.hash(data.roomPassword, 10) : null;
    
    const updatedRoom = await prisma.classroom.update({
        where: { id: id },
        data: {
            name: data.name,
            description: data.description,
            status: data.status,
            private: data.private,
            // Only update password if a new one was provided
            ...(hashedPassword && { roompassword: hashedPassword }) 
        }
    });
    return updatedRoom;
}

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

export const generateInviteToken = async (classroomId, requestingUserId) => {
    const room = await prisma.classroom.findUnique({ where: { id: classroomId } });
    if (!room) throw new Error('Room not found');
    if (room.userId !== requestingUserId) throw new Error('Unauthorized: Only the owner can generate an invite link');

    const token = jwt.sign({ classroomId }, env.JWT_SECRET, { expiresIn: '24h' });
    return token;
}

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
        }
        throw err;
    }
}