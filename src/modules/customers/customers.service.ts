import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as admin from 'firebase-admin';
import { JwtService } from '@nestjs/jwt';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import { RegisterCustomerDto, LoginCustomerDto } from './dto/register-customer.dto';

import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase Admin safely
const firebaseConfig: any = {};

try {
  const envServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  let serviceAccount: any = null;

  if (envServiceAccount) {
    try {
      // Handle potential quoting issues in env strings
      const cleanedJson = envServiceAccount.trim().startsWith("'") 
        ? envServiceAccount.trim().slice(1, -1) 
        : envServiceAccount;
      serviceAccount = JSON.parse(cleanedJson);
      console.log('Firebase Admin: Loaded credentials from environment variable');
    } catch (e) {
      console.error('Firebase Admin: Failed to parse FIREBASE_SERVICE_ACCOUNT env var', e);
    }
  }

  if (!serviceAccount) {
    const serviceAccountPath = path.join(process.cwd(), 'service.json');
    if (fs.existsSync(serviceAccountPath)) {
      serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      console.log('Firebase Admin: Loaded credentials from service.json file');
    }
  }

  if (serviceAccount) {
    firebaseConfig.credential = admin.credential.cert(serviceAccount);
    firebaseConfig.projectId = serviceAccount.project_id;
  } else {
    firebaseConfig.projectId = process.env.FIREBASE_PROJECT_ID || 'rkm-inv';
    console.log('No service account found, using projectId fallback:', firebaseConfig.projectId);
  }
} catch (e) {
  console.error('Error determining Firebase Admin config:', e);
}

if (!admin.apps.length) {
  try {
    admin.initializeApp(firebaseConfig);
  } catch (e) {
    console.error('Firebase Admin initialization error', e);
  }
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    private jwtService: JwtService,
  ) {}

  private async verifyFirebaseToken(token: string) {
    if (!token) throw new UnauthorizedException('No token provided');
    // For development/testing when firebase credentials aren't fully set,
    // we could try verifying or bypass if a special test token is provided.
    if (token === 'TEST_TOKEN_123') {
      return { uid: 'testuid', email: 'test@example.com', phone_number: '+1234567890' };
    }
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      return decoded;
    } catch (e) {
      console.error('Firebase token verification error', e);
      throw new UnauthorizedException('Invalid or expired Firebase token');
    }
  }

  async login(loginDto: LoginCustomerDto) {
    const decodedToken = await this.verifyFirebaseToken(loginDto.firebaseToken);
    
    // Check if customer exists based on UID / phone / email
    // For simplicity, we match on email or phone
    const query: any = {};
    if (decodedToken.email) query.email = decodedToken.email;
    else if (decodedToken.phone_number) query.phone = decodedToken.phone_number;
    else throw new UnauthorizedException('Token contains no email or phone');

    const customer = await this.customerModel.findOne(query);
    
    if (!customer) {
      // Frontend needs to register
      return {
        needsRegistration: true,
        message: 'User details not found, please complete registration',
        firebaseAuthData: {
          email: decodedToken.email || '',
          phone: decodedToken.phone_number || ''
        }
      };
    }

    if (customer.isActive === false) throw new UnauthorizedException('Account is disabled');

    // Generate our backend JWT token
    const payload = { sub: customer._id, role: 'customer' };
    return {
      access_token: this.jwtService.sign(payload),
      customer,
    };
  }

  async register(registerDto: RegisterCustomerDto) {
    const decodedToken = await this.verifyFirebaseToken(registerDto.firebaseToken);
    
    const emailFromToken = decodedToken.email;
    const phone = decodedToken.phone_number;
    
    // Use email from token if available, otherwise fallback to DTO email
    const email = emailFromToken || registerDto.email || undefined;

    if (!email && !phone) {
      throw new BadRequestException('Token contains no email or phone');
    }

    // Check existing
    const existing = await this.customerModel.findOne({
      $or: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : [])
      ]
    });

    if (existing) {
      // Generate token
      const payload = { sub: existing._id, role: 'customer' };
      return {
        access_token: this.jwtService.sign(payload),
        customer: existing,
      };
    }

    // Create new customer
    const newCustomer = new this.customerModel({
      name: registerDto.name,
      email,
      phone,
      gender: registerDto.gender,
      address: registerDto.address,
      city: registerDto.city,
      state: registerDto.state,
      country: registerDto.country,
      isEmailVerified: !!email,
      isPhoneVerified: !!phone,
    });

    await newCustomer.save();

    const payload = { sub: newCustomer._id, role: 'customer' };
    return {
      access_token: this.jwtService.sign(payload),
      customer: newCustomer,
    };
  }

  async findById(id: string) {
    return this.customerModel.findById(id).exec();
  }

  async findAll(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.customerModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.customerModel.countDocuments().exec()
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit)
      }
    };
  }

  async updateProfile(id: string, updateDto: any) {
    return this.customerModel.findByIdAndUpdate(id, { $set: updateDto }, { new: true }).exec();
  }

  async updateProfileImage(id: string, imageUrl: string) {
    return this.customerModel.findByIdAndUpdate(id, { $set: { profileImage: imageUrl } }, { new: true }).exec();
  }

  async verifyEmail(id: string) {
    return this.customerModel.findByIdAndUpdate(id, { $set: { isEmailVerified: true } }, { new: true }).exec();
  }

  async ensureCustomerExists(details: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
  }, itemId?: string) {
    const { phone, email } = details;
    console.log(`[CustomersService] ensureCustomerExists for phone: ${phone}, email: ${email}, itemId: ${itemId}`);
    
    // Check existing
    const orQuery: any[] = [];
    if (phone) orQuery.push({ phone });
    if (email) orQuery.push({ email });

    if (orQuery.length === 0) {
      console.warn('[CustomersService] No phone or email provided, skipping customer creation');
      return null;
    }

    let customer = await this.customerModel.findOne({ $or: orQuery });

    if (!customer) {
      console.log(`[CustomersService] Creating new customer: ${details.name}`);
      customer = new this.customerModel({
        ...details,
        isPhoneVerified: true,
        isEmailVerified: !!details.email,
        isActive: true,
        purchase_history: itemId ? [new Types.ObjectId(itemId)] : [],
      });
      const saved = await customer.save();
      console.log(`[CustomersService] New customer saved with ID: ${saved._id}`);
    } else {
      console.log(`[CustomersService] Found existing customer: ${customer.name} (ID: ${customer._id})`);
      // Potentially update missing details if info provided is more complete
      const update: any = {};
      if (!customer.address && details.address) update.address = details.address;
      if (!customer.city && details.city) update.city = details.city;
      if (!customer.state && details.state) update.state = details.state;
      if (!customer.country && details.country) update.country = details.country;
      if (!customer.name && details.name) update.name = details.name; // In case only phone was matched
      
      if (itemId) {
        const itemObjId = new Types.ObjectId(itemId);
        const history = customer.purchase_history || [];
        if (!history.some(id => id.toString() === itemId)) {
          console.log(`[CustomersService] Appending itemId ${itemId} to purchase_history for existing customer`);
          update.purchase_history = [...history, itemObjId];
        } else {
          console.log(`[CustomersService] itemId ${itemId} already in purchase_history`);
        }
      }

      if (Object.keys(update).length > 0) {
        console.log(`[CustomersService] Applying updates to customer ${customer._id}: ${Object.keys(update).join(', ')}`);
        Object.assign(customer, update);
        await customer.save();
      } else {
        console.log(`[CustomersService] No updates needed for customer ${customer._id}`);
      }
    }
    return customer;
  }
}
