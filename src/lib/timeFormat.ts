import { format } from 'date-fns'

export type TimeFormat = '12h' | '24h'

// "9:30 AM" or "09:30"
export const formatTime = (d: Date, tf: TimeFormat) => format(d, tf === '24h' ? 'HH:mm' : 'h:mm a')

// Hour-gutter label: "9 AM" or "09:00"
export const formatHour = (h: number, tf: TimeFormat) =>
  format(new Date(2000, 0, 1, h), tf === '24h' ? 'HH:mm' : 'h a')
