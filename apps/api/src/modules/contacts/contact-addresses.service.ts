import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound } from '@/common';
import { CustomFieldsValidator } from '@/modules/custom-fields/custom-fields.validator';
import { ContactsService } from './contacts.service';
import { CreateContactAddressDto, UpdateContactAddressDto } from './dto';

@Injectable()
export class ContactAddressesService {
  constructor(
    private prisma: PrismaService,
    private customFieldsValidator: CustomFieldsValidator,
    private contactsService: ContactsService,
  ) {}

  async addAddress(contactId: string, dto: CreateContactAddressDto, user: User) {
    const contact = await this.contactsService.findOne(contactId, user);
    const cfData = dto.customFields
      ? await this.customFieldsValidator.validateAndSanitize(contact.orgId, 'CONTACT_ADDRESS', dto.customFields)
      : null;

    const needsTransaction = dto.isPrimary || dto.isPostal || dto.isInvoice;

    if (needsTransaction) {
      return this.prisma.$transaction(async (tx) => {
        // If setting as primary, unset other primary addresses
        if (dto.isPrimary) {
          await tx.contactAddress.updateMany({
            where: { contactId: contact.id, isPrimary: true },
            data: { isPrimary: false },
          });
        }
        // If setting as postal, unset other postal addresses
        if (dto.isPostal) {
          await tx.contactAddress.updateMany({
            where: { contactId: contact.id, isPostal: true },
            data: { isPostal: false },
          });
        }
        // If setting as invoice, unset other invoice addresses
        if (dto.isInvoice) {
          await tx.contactAddress.updateMany({
            where: { contactId: contact.id, isInvoice: true },
            data: { isInvoice: false },
          });
        }

        return tx.contactAddress.create({
          data: {
            contactId: contact.id,
            label: dto.label,
            street: dto.street,
            houseNumber: dto.houseNumber,
            postalCode: dto.postalCode,
            city: dto.city,
            country: dto.country ?? 'NL',
            isPrimary: dto.isPrimary ?? false,
            isPostal: dto.isPostal ?? false,
            isInvoice: dto.isInvoice ?? false,
            customFields: cfData as any,
          },
        });
      });
    }

    return this.prisma.contactAddress.create({
      data: {
        contactId: contact.id,
        label: dto.label,
        street: dto.street,
        houseNumber: dto.houseNumber,
        postalCode: dto.postalCode,
        city: dto.city,
        country: dto.country ?? 'NL',
        isPrimary: dto.isPrimary ?? false,
        isPostal: dto.isPostal ?? false,
        isInvoice: dto.isInvoice ?? false,
        customFields: cfData as any,
      },
    });
  }

  async updateAddress(
    addressId: string,
    dto: UpdateContactAddressDto,
    user: User,
  ) {
    const address = assertFound(
      await this.prisma.contactAddress.findUnique({
        where: { id: addressId },
        include: { contact: true },
      }),
      'Adres',
    );

    // Verify org scoping via contact
    await this.contactsService.findOne(address.contactId, user);

    let cfData: any = undefined;
    if (dto.customFields !== undefined) {
      const merged = { ...((address.customFields as Record<string, any>) ?? {}), ...dto.customFields };
      cfData = await this.customFieldsValidator.validateAndSanitize(address.contact.orgId, 'CONTACT_ADDRESS', merged);
    }

    const needsTransaction = dto.isPrimary || dto.isPostal || dto.isInvoice;

    if (needsTransaction) {
      return this.prisma.$transaction(async (tx) => {
        if (dto.isPrimary) {
          await tx.contactAddress.updateMany({
            where: { contactId: address.contactId, isPrimary: true, id: { not: addressId } },
            data: { isPrimary: false },
          });
        }
        if (dto.isPostal) {
          await tx.contactAddress.updateMany({
            where: { contactId: address.contactId, isPostal: true, id: { not: addressId } },
            data: { isPostal: false },
          });
        }
        if (dto.isInvoice) {
          await tx.contactAddress.updateMany({
            where: { contactId: address.contactId, isInvoice: true, id: { not: addressId } },
            data: { isInvoice: false },
          });
        }

        return tx.contactAddress.update({
          where: { id: addressId },
          data: {
            ...(dto.label !== undefined && { label: dto.label }),
            ...(dto.street !== undefined && { street: dto.street }),
            ...(dto.houseNumber !== undefined && { houseNumber: dto.houseNumber }),
            ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
            ...(dto.city !== undefined && { city: dto.city }),
            ...(dto.country !== undefined && { country: dto.country }),
            ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
            ...(dto.isPostal !== undefined && { isPostal: dto.isPostal }),
            ...(dto.isInvoice !== undefined && { isInvoice: dto.isInvoice }),
            ...(cfData !== undefined && { customFields: cfData as any }),
          },
        });
      });
    }

    return this.prisma.contactAddress.update({
      where: { id: addressId },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.street !== undefined && { street: dto.street }),
        ...(dto.houseNumber !== undefined && { houseNumber: dto.houseNumber }),
        ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
        ...(dto.isPostal !== undefined && { isPostal: dto.isPostal }),
        ...(dto.isInvoice !== undefined && { isInvoice: dto.isInvoice }),
        ...(cfData !== undefined && { customFields: cfData as any }),
      },
    });
  }

  async deleteAddress(addressId: string, user: User) {
    const address = assertFound(
      await this.prisma.contactAddress.findUnique({
        where: { id: addressId },
      }),
      'Adres',
    );

    // Verify org scoping via contact
    await this.contactsService.findOne(address.contactId, user);

    await this.prisma.contactAddress.delete({
      where: { id: addressId },
    });
  }
}
