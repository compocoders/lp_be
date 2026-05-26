import { verifyToken } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';
import { prisma } from '../config/db.js';

export const authenticate = async (req, res, next) => {
  try {
    let token;

    // 1. Check for token in cookies (the new secure way)
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    } 
    // 2. Fallback to Authorization header if cookies aren't used
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw new ApiError(401, 'Unauthorized - No token provided');
    }

    const decoded = verifyToken(token);

    if (!decoded || !decoded.userId) {
      throw new ApiError(401, 'Unauthorized - Invalid token');
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      throw new ApiError(401, 'Unauthorized - User not found');
    }

    req.user = user;
    next();
  } catch (error) {
    next(new ApiError(401, 'Unauthorized'));
  }
};
