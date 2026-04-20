import { permanentRedirect } from 'next/navigation';

/** Intel hub: default surface is Telescreen. */
export default function IntelRedirectPage() {
  permanentRedirect('/telescreen');
}
