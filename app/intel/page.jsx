import { permanentRedirect } from 'next/navigation';

/** Intel hub: default surface is the OSINT desk. */
export default function IntelRedirectPage() {
  permanentRedirect('/intel/osint');
}
