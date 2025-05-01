
'use client';

import {Button} from '@/components/ui/button';
import Link from 'next/link';
import {useRouter, usePathname} from 'next/navigation'; // Correct import
import {useEffect, useState, useCallback} from 'react'; // Added useCallback

const LOGGED_IN_USER_KEY = 'loggedInUser'; // Key for session storage

const ClientHeader = () => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | undefined>(undefined); // Initialize as undefined
  const router = useRouter();
  const pathname = usePathname();

  // Function to check login status and update state
  const checkLoginStatus = useCallback(() => {
    // Ensure this runs only client-side
    if (typeof window !== 'undefined') {
      const storedUser = sessionStorage.getItem(LOGGED_IN_USER_KEY); // Use sessionStorage
      const loggedIn = !!storedUser;
      setIsLoggedIn(prev => (prev !== loggedIn ? loggedIn : prev));
    } else {
       setIsLoggedIn(false);
    }
  }, []);


  // Effect for initial check and storage events
  useEffect(() => {
    checkLoginStatus(); // Check immediately on mount

    const handleStorageChange = (event: StorageEvent) => {
      // Check if the change happened on the 'loggedInUser' key or if storage was cleared
       // Listen to sessionStorage changes (less standard but possible via polling or custom events if needed)
       // For simplicity, we'll rely on path changes and initial load for sessionStorage checks
      // If using localStorage, the 'storage' event works directly:
       if (event.storageArea === localStorage && (event.key === LOGGED_IN_USER_KEY || event.key === null)) {
         checkLoginStatus();
       }
       // If using sessionStorage, manual re-check on relevant actions/navigation is needed
    };

    window.addEventListener('storage', handleStorageChange); // Primarily for localStorage

    // Cleanup listener on component unmount
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [checkLoginStatus]);

  // Effect for path changes (important for sessionStorage updates)
  useEffect(() => {
    checkLoginStatus();
  }, [pathname, checkLoginStatus]);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(LOGGED_IN_USER_KEY); // Use sessionStorage
      setIsLoggedIn(false); // Update state immediately
      router.replace('/'); // Redirect to login page
    }
  };

  // Determine if on an authentication page AFTER state is determined
  const isOnAuthPage = pathname === '/' || pathname === '/register';

  // Avoid rendering anything until login status is determined client-side
   if (isLoggedIn === undefined) {
        // Render an empty header or a placeholder matching height to prevent layout shift
       return <header className="flex justify-end p-4 sticky top-0 z-50 bg-background border-b h-[57px]"></header>; // Adjust height as needed
   }


  return (
    // Added min-height to match button height + padding, preventing layout shift
    <header className="flex justify-end p-4 sticky top-0 z-50 bg-background border-b min-h-[57px] items-center">
      {isLoggedIn ? (
        // User is logged in, show Logout button
        <Button onClick={handleLogout} variant="outline">Logout</Button>
      ) : !isOnAuthPage ? (
        // User is not logged in AND not on an auth page, show Login button
        <Link href="/">
          <Button variant="outline">Login</Button>
        </Link>
      ) : (
        // User is not logged in AND is on an auth page (login or register), show nothing
        null
      )}
    </header>
  );
};

export default ClientHeader;
