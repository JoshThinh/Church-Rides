import { PageTitle } from '../components/ui';

export function About() {
  return (
    <div className="page page--narrow prose">
      <PageTitle>How it works</PageTitle>

      <h2>Riders</h2>
      <ol>
        <li>Pick Church rides, CL rides, or Events, then choose a date.</li>
        <li>Enter your name and phone, and choose your pickup spot at SDSU.</li>
        <li>Pick a driver, or choose "Any driver" and we'll put you in a car that's already stopping near you.</li>
        <li>Tap "Join group chat" to get into your driver's Messenger group.</li>
      </ol>
      <p>
        "Remember me" saves your details on this phone only, so next time it's one tap. You don't need an account.
      </p>

      <h2>Drivers</h2>
      <ol>
        <li>Open the menu and choose "Drive / register my car." Sign in with your email.</li>
        <li>Add your car and how many seats you have.</li>
        <li>Offer a ride and paste your Messenger group chat link.</li>
        <li>Your riders show up grouped by pickup spot, with call and text buttons.</li>
      </ol>
      <p>The group chat link disappears from the site once the event ends.</p>

      <h2>Privacy</h2>
      <p>
        Only your driver and ride coordinators can see your phone number. Other riders only see drivers' first names, cars, and
        open seats.
      </p>
    </div>
  );
}
