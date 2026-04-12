import { permanentRedirect } from 'next/navigation';

/** Canonical OSINT desk is `/intel/osint`. */
export default function IntelLiveRedirectPage() {
  permanentRedirect('/intel/osint');
}
