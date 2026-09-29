import Phone from '@/components/Phone';
import { MusicPhone } from '@/components/Music';
import { QuitGame } from '@/components/QuitGame';

export const metadata = { title: 'Join Us, Again' };

export default function Page() {
  return (<><Phone /><QuitGame /><MusicPhone /></>);
}
