'use client';

import {Button} from '@/components/ui/button';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect, useState} from 'react';

const ClientHeader = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false); // State to track login status
  const router = useRouter();

  useEffect(() => {
    // Check if a user is logged in on component mount
    const storedUser = localStorage.getItem('loggedInUser');
    if (storedUser) {
      setIsLoggedIn(true);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('loggedInUser'); // Remove user from localStorage
    setIsLoggedIn(false);
    router.push('/'); // Redirect to the login page
  };

  return (
    <header className="flex justify-end p-4">
      {isLoggedIn ? (
        <Button onClick={handleLogout}>Logout</Button>
      ) : (
        <Link href="/">
          <Button>Login</Button>
        </Link>
      )}
    </header>
  );
};

export default ClientHeader;
