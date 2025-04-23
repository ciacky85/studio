'use client';

import {Button} from '@/components/ui/button';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect, useState} from 'react';
import {usePathname} from 'next/navigation';

const ClientHeader = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false); // State to track login status
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check if a user is logged in on component mount
    const storedUser = localStorage.getItem('loggedInUser');
    if (storedUser) {
      setIsLoggedIn(true);
    } else {
      setIsLoggedIn(false);
    }
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem('loggedInUser'); // Remove user from localStorage
    setIsLoggedIn(false);
    router.push('/'); // Redirect to the login page
  };

  const showLogin = !isLoggedIn && pathname === '/';

  return (
    <header className="flex justify-end p-4">
      {isLoggedIn ? (
        <Button onClick={handleLogout}>Logout</Button>
      ) : showLogin ? null : (
        <Link href="/">
          <Button>Login</Button>
        </Link>
      )}
    </header>
  );
};

export default ClientHeader;
