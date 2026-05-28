import * as authService from '../services/auth.service.js';

export const register = async (req, res, next) => {
  try {
    const result = await authService.registerUser(req.body);
    // 1. Set the cookie
    res.cookie('token', result.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict' });
    // 2. Only send the user data back!
    res.status(201).json({ user: result.user }); 
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const result = await authService.loginUser(req.body);
    res.cookie('token', result.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict' });
    // 2. Only send the user data back!
    res.status(201).json({ user: result.user }); 
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    res.status(200).json({
      user: {
        id: req.user.id,
        email: req.user.email,
      }
    });
  } catch (error) {
    next(error);
  }
};
