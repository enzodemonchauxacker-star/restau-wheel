/** Téléphone réel. Les robots et les tablettes restent sur le site. */
function isPhoneUserAgent(ua) {
  const s = String(ua || '');
  if (/bot|crawler|crawl|spider|slurp|bingpreview|facebookexternalhit|linkedinbot|twitterbot|telegrambot|discordbot|slackbot|googleimageproxy|applebot|semrush|ahrefs/i.test(s)) {
    return false;
  }
  return /iPhone|iPod|Android.+Mobile|webOS|BlackBerry|IEMobile|Opera Mini|Windows Phone/i.test(s);
}

module.exports = { isPhoneUserAgent };
