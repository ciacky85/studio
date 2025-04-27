'use client';

import {Button} from '@/components/ui/button';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect, useState} from 'react';
import {usePathname} from 'next/navigation';

const ClientHeader = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check login status whenever the path changes or component mounts
    const checkLoginStatus = () => {
      const storedUser = localStorage.getItem('loggedInUser');
      setIsLoggedIn(!!storedUser); // Set based on whether storedUser exists
    };

    checkLoginStatus(); // Check immediately on mount/render

    // Optional: Add an event listener if login status can change without navigation
    // window.addEventListener('storage', checkLoginStatus);
    // return () => window.removeEventListener('storage', checkLoginStatus);

  }, [pathname]); // Re-run effect when pathname changes

  const handleLogout = () => {
    localStorage.removeItem('loggedInUser');
    setIsLoggedIn(false);
    router.push('/'); // Redirect to the login page
    // Force a re-render or state update if needed, though setIsLoggedIn should trigger it.
  };

  const isOnAuthPage = pathname === '/' || pathname === '/register';

  return (
    <header className="flex justify-end p-4">
      {isLoggedIn ? (
        // User is logged in, show Logout button
        <Button onClick={handleLogout}>Logout</Button>
      ) : !isOnAuthPage ? (
        // User is not logged in AND not on an auth page, show Login button
        <Link href="/">
          <Button>Login</Button>
        </Link>
      ) : (
        // User is not logged in AND is on an auth page, show nothing
        null
      )}
    </header>
  );
};

export default ClientHeader;
