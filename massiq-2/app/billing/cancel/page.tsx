import { redirect } from 'next/navigation';

export default function BillingCancelPage() {
  // User canceled checkout — send them back to the app with a toast signal
  redirect('/app?checkout=cancel');
}
