import bcrypt from 'bcryptjs';
import { prisma } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { generateToken } from '../utils/jwt.js';

export const registerUser = async (data) => {
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    throw new ApiError(400, 'Email already in use');
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      password: hashedPassword,
    },
  });

  const token = generateToken(user.id);
  
  return {
    user: {
      id: user.id,
      email: user.email,
    },
    token,
  };
};

export const loginUser = async (data) => {
  const user = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (!user) {
    throw new ApiError(400, 'Invalid email or password');
  }

  const isPasswordValid = await bcrypt.compare(data.password, user.password);
  
  if (!isPasswordValid) {
    throw new ApiError(400, 'Invalid email or password');
  }

  const token = generateToken(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    token,
  };
};

export const updateEmailUser = async (userId, currentPassword, newEmail) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');

  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordValid) throw new ApiError(400, 'Incorrect current password');

  const emailExists = await prisma.user.findUnique({ where: { email: newEmail } });
  if (emailExists && emailExists.id !== userId) {
    throw new ApiError(400, 'Email is already in use by another account');
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { email: newEmail }
  });

  return { id: updatedUser.id, email: updatedUser.email };
};

export const updatePasswordUser = async (userId, currentPassword, newPassword) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');

  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordValid) throw new ApiError(400, 'Incorrect current password');

  const hashedNewPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedNewPassword }
  });
};
