import { BadRequestException } from '@nestjs/common';

/** Keeps only our own uploaded item-photo paths; every pledged / bought item must carry at least one. */
export function cleanItemImages(item: any, label: string): string[] {
  const imgs = (Array.isArray(item?.images) ? item.images : []).filter(
    (u: any) => typeof u === 'string' && u.startsWith('/static/item-photos/'),
  );
  if (imgs.length === 0) {
    throw new BadRequestException(`Add at least one photo of the item "${item?.description ?? label}"`);
  }
  return imgs;
}
