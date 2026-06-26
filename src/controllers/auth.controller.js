import * as authService from '../services/auth.service.js';

export const register = async (req, res, next) => {
  try {
    const result = await authService.registerUser(req.body);
    // 1. Set the cookie
    res.cookie('token', result.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax' });
    // 2. Only send the user data back!
    res.status(201).json({ user: result.user, token: result.token }); 
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const result = await authService.loginUser(req.body);
    res.cookie('token', result.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax' });
    // 2. Only send the user data back!
    res.status(201).json({ user: result.user, token: result.token }); 
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

export const logout = async (req, res, next) => {
  try {
    res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax' });
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

export const updateEmail = async (req, res, next) => {
  try {
    const { currentPassword, newEmail } = req.body;
    const result = await authService.updateEmailUser(req.user.id, currentPassword, newEmail);
    res.status(200).json({ message: 'Email updated successfully', user: result });
  } catch (error) {
    next(error);
  }
};

export const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.updatePasswordUser(req.user.id, currentPassword, newPassword);
    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    next(error);
  }
};
