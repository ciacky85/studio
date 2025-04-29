
'use client';

import {Button} from '@/components/ui/button';
import Link from 'next/link';
import {useRouter, usePathname} from 'next/navigation';
import {useEffect, useState, useCallback} from 'react';

const LOGGED_IN_USER_KEY = 'loggedInUser'; // Session key remains in localStorage

const ClientHeader = () => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | undefined>(undefined);
  const router = useRouter();
  const pathname = usePathname();

  // Function to check login status based on localStorage session key
  const checkLoginStatus = useCallback(() => {
    if (typeof window !== 'undefined') {
      const storedUserSession = localStorage.getItem(LOGGED_IN_USER_KEY);
      const loggedIn = !!storedUserSession;
      setIsLoggedIn(prev => (prev !== loggedIn ? loggedIn : prev));
    } else {
       setIsLoggedIn(false);
    }
  }, []);


  // Effect for initial check and storage events (for session key)
  useEffect(() => {
    checkLoginStatus();

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === LOGGED_IN_USER_KEY || event.key === null) {
        checkLoginStatus();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [checkLoginStatus]);

  // Effect for path changes
  useEffect(() => {
    checkLoginStatus();
  }, [pathname, checkLoginStatus]);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOGGED_IN_USER_KEY); // Remove only session key
      setIsLoggedIn(false);
      router.replace('/'); // Redirect to login page
    }
  };

  // Determine if on an auth page AFTER state is determined
  const isOnAuthPage = pathname === '/' || pathname === '/register';

  // Avoid rendering until login status is determined client-side
   if (isLoggedIn === undefined) {
       return <header className="flex justify-end p-4 sticky top-0 z-50 bg-background border-b h-[57px]"></header>;
   }


  return (
    <header className="flex justify-end p-4 sticky top-0 z-50 bg-background border-b min-h-[57px] items-center">
      {isLoggedIn ? (
        <Button onClick={handleLogout} variant="outline">Logout</Button>
      ) : !isOnAuthPage ? (
        <Link href="/">
          <Button variant="outline">Login</Button>
        </Link>
      ) : null}
    </header>
  );
};

export default ClientHeader;
