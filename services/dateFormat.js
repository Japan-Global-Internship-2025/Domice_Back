export const getTodayDateStr = (now = new Date()) => {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const getTodayRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
};

//이번주 금요일 구하는 함수
export const getThisFriday = () => {
  const today = new Date();
  const currentDay = today.getDay();
  let daysUntilFriday = 5 - currentDay;
  if (daysUntilFriday < 0) {
    daysUntilFriday += 7;
  }
  today.setDate(today.getDate() + daysUntilFriday);

  return getTodayDateStr(today);
}