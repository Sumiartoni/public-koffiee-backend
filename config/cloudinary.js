import cloudinaryPkg from 'cloudinary';
const cloudinary = cloudinaryPkg.v2;
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dzmx2jlgn',
    api_key: process.env.CLOUDINARY_API_KEY || '499371423222765',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'RMIGF3XGe856m1tWudilvj9BB4Q'
});

export default cloudinary;
