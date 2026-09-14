export interface SharePayload {
  title: string;
  text: string;
  url: string;
}

export function shareViaWhatsApp({ text, url }: SharePayload): void {
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank', 'noopener,noreferrer');
}

export function shareViaMessenger({ url }: SharePayload): void {
  window.open(`https://www.facebook.com/dialog/send?link=${encodeURIComponent(url)}&redirect_uri=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer');
}

export function shareViaSms({ text, url }: SharePayload): void {
  window.open(`sms:?body=${encodeURIComponent(`${text}\n${url}`)}`, '_self');
}

export function shareViaMail({ title, text, url }: SharePayload): void {
  window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text}\n${url}`)}`, '_self');
}

export function copyShareLink({ text, url }: SharePayload): void {
  const payload = `${text}\n${url}`;
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(payload);
  }
}
