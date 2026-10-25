import { permanentRedirect } from 'next/navigation';

/** Defense desk is retired. Conflict reporting remains on Watchdogs. */
export default function IntelDefenseRedirect() {
  permanentRedirect('/intel/watchdogs');
}
