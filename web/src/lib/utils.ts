/** Menggabungkan nama kelas (nilai falsy dilewati). */
export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');
