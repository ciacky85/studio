
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

  // Function to check login status
  const checkLoginStatus = () => {
    if (typeof window !== 'undefined') {
      const storedUser = localStorage.getItem('loggedInUser');
      setIsLoggedIn(!!storedUser); // Set based on whether storedUser exists
    }
  };

  useEffect(() => {
    checkLoginStatus(); // Check immediately on mount/render

    // Add an event listener for storage changes to handle login/logout in other tabs/windows
    const handleStorageChange = () => {
      checkLoginStatus();
    };

    window.addEventListener('storage', handleStorageChange);

    // Cleanup listener on component unmount
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []); // Run only once on mount

  useEffect(() => {
    // Also check status on path change, as navigation might occur after login/logout actions
    // within the same tab without a full page reload or storage event.
    checkLoginStatus();
  }, [pathname]); // Re-run effect when pathname changes

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('loggedInUser');
      setIsLoggedIn(false);
      router.push('/'); // Redirect to the login page
      // No need to force re-render, setIsLoggedIn handles it.
    }
  };

  const isOnAuthPage = pathname === '/' || pathname === '/register';

  return (
    <header className="flex justify-end p-4 sticky top-0 z-50 bg-background border-b"> {/* Added sticky positioning and background */}
      {isLoggedIn ? (
        // User is logged in, show Logout button
        <Button onClick={handleLogout} variant="outline">Logout</Button>
      ) : !isOnAuthPage ? (
        // User is not logged in AND not on an auth page, show Login button
        <Link href="/">
          <Button variant="outline">Login</Button>
        </Link>
      ) : (
        // User is not logged in AND is on an auth page, show nothing
        null
      )}
    </header>
  );
};

export default ClientHeader;
