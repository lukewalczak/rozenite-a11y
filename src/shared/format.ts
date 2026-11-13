export const roundToTenth = (value: number) => Math.round(value * 10) / 10;

export const formatNumber = (value: number) => String(roundToTenth(value));
