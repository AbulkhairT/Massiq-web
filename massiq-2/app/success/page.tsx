import { redirect } from 'next/navigation';

export default function GenericSuccessPage() {
  redirect('/app?checkout=success');
}

