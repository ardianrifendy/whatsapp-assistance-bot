import { DateTime } from 'luxon';
import { TIMEZONE } from './constants.js';

export function nowJakarta(): DateTime {
  return DateTime.now().setZone(TIMEZONE);
}

export function formatJakarta(date: Date): string {
  return DateTime.fromJSDate(date).setZone(TIMEZONE).toFormat('dd/MM/yyyy HH:mm');
}

export function minutesFromNow(minutes: number): Date {
  return DateTime.now().plus({ minutes }).toJSDate();
}
