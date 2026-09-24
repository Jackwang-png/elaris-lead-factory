import { Controller, Get, Post, Body, Put, Param, Query, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';

@ApiTags('Customers')
@Controller('customers')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all customers' })
  async list(
    @CurrentUser() user: User,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('status') status?: string
  ) {
    try {
      return await this.customersService.list({
        page: parseInt(page),
        limit: parseInt(limit),
        search,
        status,
        tenantId: user.tenantId
      });
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch customers',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create a new customer' })
  async create(@Body() createCustomerDto: CreateCustomerDto, @CurrentUser() user: User) {
    try {
      return await this.customersService.create({
        ...createCustomerDto,
        tenantId: user.tenantId
      });
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to create customer',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID' })
  async findById(@Param('id') id: string, @CurrentUser() user: User) {
    try {
      return await this.customersService.findById(id, user.tenantId);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch customer',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update customer' })
  async update(
    @Param('id') id: string,
    @Body() updateCustomerDto: Partial<CreateCustomerDto>,
    @CurrentUser() user: User
  ) {
    try {
      return await this.customersService.update(id, updateCustomerDto, user.tenantId);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to update customer',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
