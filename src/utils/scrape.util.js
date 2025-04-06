module.exports.extractLatLngFromGoogleMapsUrl = (url) => {
  const coordMatch = url.match(/@([0-9\.]+),([0-9\.]+),([0-9z]+)/);
  return coordMatch ? {
    coordinates: [
      parseFloat(coordMatch[2]), 
      parseFloat(coordMatch[1])  
    ]
  } : null;
};

module.exports.getNextSixDays = () => {
  const now = new Date();
  const vietnamOffset = 7 * 60 * 60 * 1000;
  const today = new Date(now.getTime() + vietnamOffset);
  
  const days = [];
  
  for (let i = 0; i < 6; i++) {
    const nextDay = new Date(today);
    nextDay.setDate(today.getDate() + i);
    
    const year = nextDay.getUTCFullYear();
    const month = String(nextDay.getUTCMonth() + 1).padStart(2, '0');
    const day = String(nextDay.getUTCDate()).padStart(2, '0');
    
    days.push(`${year}-${month}-${day}`);
  }
  
  return days;
}