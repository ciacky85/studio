
'use client';

import {Button} from '@/components/ui/button';
import Link from 'next/link';
import {useRouter, usePathname} from 'next/navigation'; // Correct import
import {useEffect, useState, useCallback} from 'react'; // Added useCallback

const ClientHeader = () => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | undefined>(undefined); // Initialize as undefined
  const router = useRouter();
  const pathname = usePathname();

  // Function to check login status and update state
  const checkLoginStatus = useCallback(() => {
    // Ensure this runs only client-side
    if (typeof window !== 'undefined') {
      const storedUser = localStorage.getItem('loggedInUser');
      const loggedIn = !!storedUser;
      // Only update state if it has changed to avoid unnecessary re-renders
      // Use functional update to safely get previous state
      setIsLoggedIn(prev => (prev !== loggedIn ? loggedIn : prev));
    } else {
      // Set to false during SSR or if window is not available yet
       setIsLoggedIn(false); // Or keep undefined until client check runs? Setting false assumes not logged in initially server-side.
    }
  }, []); // No dependencies needed for useCallback here


  // Effect for initial check and storage events
  useEffect(() => {
    checkLoginStatus(); // Check immediately on mount

    const handleStorageChange = (event: StorageEvent) => {
      // Check if the change happened on the 'loggedInUser' key or if storage was cleared
      if (event.key === 'loggedInUser' || event.key === null) {
        checkLoginStatus();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Cleanup listener on component unmount
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [checkLoginStatus]); // Depend on the stable checkLoginStatus function

  // Effect for path changes
  useEffect(() => {
    // Check status whenever the path changes to handle SPA navigation
    checkLoginStatus();
  }, [pathname, checkLoginStatus]); // Depend on pathname and the stable checkLoginStatus

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('loggedInUser');
      setIsLoggedIn(false); // Update state immediately
      router.replace('/'); // Redirect to login page using replace to prevent back navigation to logged-in state
      // No need to manually setRole to null here, the page component's useEffect will handle it
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

