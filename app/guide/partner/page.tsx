import { redirect } from 'next/navigation';

// Language-neutral entry — default to English; visitors switch via the
// header pills, and each language keeps its own crawlable path.
export default function PartnerPlaybookIndex() {
  redirect('/guide/partner/en');
}
