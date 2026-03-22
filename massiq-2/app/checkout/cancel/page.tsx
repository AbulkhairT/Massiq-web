import { redirect } from 'next/navigation';

export default function CheckoutCancelPage() {
  redirect('/app?checkout=cancel');
}

