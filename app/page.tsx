import Link from 'next/link';
import { Hearts } from '@/components/Deco';

export default function Home() {
  return (
    <main className="home">
      <Hearts count={12} />
      <h1 className="home-title">Us, Again <span className="heart" aria-hidden="true">♥</span></h1>
      <p className="lede">
        Ten little games for two people and an evening. Put it on the TV, answer on your phones, and take turns.
        You’re not trying to fix anything tonight. You’re remembering who this person is, and learning who they are right now.
      </p>
      <div className="home-choices">
        <Link className="choice" href="/tv">
          <span className="t">Open on the TV</span>
          <span className="b">Use a smart TV browser, or cast this tab from a laptop. It shows the room code.</span>
        </Link>
        <Link className="choice" href="/play">
          <span className="t">Join from your phone</span>
          <span className="b">Enter the code from the TV. Each of you uses your own phone.</span>
        </Link>
      </div>
      <p className="foot">Answers are erased when you finish, and sessions expire on their own. This is a way to reconnect, not a replacement for counseling.</p>
    </main>
  );
}
