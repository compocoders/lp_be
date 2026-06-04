import * as classroomService from '../services/classrooms.service.js';

export const getRoomsbyCode = async (req, res, next) => {
    try {
        const rooms = await classroomService.getRoomsbyCode(req.params.code);
        res.status(200).json(rooms);
    } catch (error) {
        next(error);
    }
}

export const createRooms = async (req, res, next) => {
    try {
        const data = { ...req.body, userId: req.user.id };
        const [room, classRoomUser] = await classroomService.createRooms(data);
        res.status(201).json({ room, classRoomUser });
    } catch (error) {
        next(error);
    }
}

export const updateRooms = async (req, res, next) => {
    try {
        const data = { ...req.body, userId: req.user.id };
        const room = await classroomService.updateRooms(req.params.id, data, req.user.id);
        res.status(200).json(room);
    } catch (error) {
        next(error);
    }
}

export const deleteRooms = async (req, res, next) => {
    try {
        await classroomService.deleteRooms(req.params.id, req.user.id);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
}

export const getRoomsbyUserId = async (req, res, next) => {
    try {
        const rooms = await classroomService.getRoomsbyUserId(req.user.id);
        res.status(200).json(rooms);
    } catch (error) {
        next(error);
    }
}

export const generateInviteLink = async (req, res, next) => {
    try {
        // req.params.id is the classroomId, req.user.id is the requesting user (must be owner/authorized)
        const token = await classroomService.generateInviteToken(req.params.id, req.user.id);
        res.status(200).json({ token });
    } catch (error) {
        next(error);
    }
}

export const joinRoomViaInvite = async (req, res, next) => {
    const data = { token: req.params.token, userId: req.user.id, roompassword: req.body?.roompassword };
    try {
        // req.params.token is the JWT token, req.user.id is the user trying to join
        const classroomUser = await classroomService.joinRoomWithToken(data.token, data.userId, data.roompassword);
        res.status(200).json({ message: 'Successfully joined the room', classroomUser });
    } catch (error) {
        next(error);
    }
}