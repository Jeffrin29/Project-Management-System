export const formatISTDate = (date: string | Date) => {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
  });
};

export const formatISTTime = (date: string | Date) => {
  if (!date) return "-";
  return new Date(date).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

export const formatISTDateTime = (date: string | Date) => {
  if (!date) return "-";
  return new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  });
};

/**
 * Returns a Date object representing the current time in IST,
 * but as a local Date object for easy getHours/getMinutes calls.
 * Note: MongoDB should still store the original UTC Date.
 */
export const getCurrentISTDate = () => {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
    })
  );
};
