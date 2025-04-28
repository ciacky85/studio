
'use client';

import {useState, useEffect} from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

// Interface for the user passed from the admin interface (includes admin role possibility)
interface DisplayUser {
    email: string;
    role: 'student' | 'professor' | 'admin'; // Align with the type passed from admin-interface
    assignedProfessorEmails?: string[] | null;
}


interface ManageUserProfessorsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    user: DisplayUser | null; // Accept the DisplayUser type directly
    allProfessors: string[];
    onSave: (userEmail: string, assignedEmails: string[]) => void;
}

export function ManageUserProfessorsDialog({
    isOpen,
    onClose,
    user,
    allProfessors,
    onSave,
}: ManageUserProfessorsDialogProps) {
    const [selectedProfessors, setSelectedProfessors] = useState<string[]>([]);

    // Initialize selected professors based on the user's current assignments when the dialog opens or user changes
    useEffect(() => {
        // Ensure user is not null and assignedProfessorEmails is an array before setting state
        if (user && Array.isArray(user.assignedProfessorEmails)) {
             // Filter out the user's own email if they are a professor
             setSelectedProfessors(
                 user.role === 'professor'
                     ? user.assignedProfessorEmails.filter(email => email !== user.email)
                     : user.assignedProfessorEmails
             );
        } else {
            setSelectedProfessors([]); // Reset if no assignments or invalid data or user is null
        }
    }, [user, isOpen]); // Re-run when the user or isOpen changes

    const handleCheckboxChange = (professorEmail: string, checked: boolean) => {
        // Prevent professor from assigning themselves
        if (user?.role === 'professor' && professorEmail === user.email) {
             return;
        }

        setSelectedProfessors(prev => {
            if (checked) {
                // Add professor if not already selected
                return [...prev, professorEmail];
            } else {
                // Remove professor
                return prev.filter(email => email !== professorEmail);
            }
        });
    };

    const handleSaveChanges = () => {
        if (user) {
            // The onSave function expects the user's email and the list of selected professors
            onSave(user.email, selectedProfessors);
        }
    };

    // Filter out the current user if they are a professor from the list of assignable professors
    // This logic remains the same, handling the 'professor' role case.
    const assignableProfessors = user?.role === 'professor'
        ? allProfessors.filter(profEmail => profEmail !== user.email)
        : allProfessors;


    if (!user || user.role === 'admin') return null; // Don't render if no user is selected or if user is admin

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    {/* Title now reflects the actual role from DisplayUser */}
                    <DialogTitle>Gestisci Professori per {user.email} ({user.role === 'student' ? 'Studente' : 'Professore'})</DialogTitle>
                    <DialogDescription>
                        Seleziona i professori da cui questo {user.role === 'student' ? 'studente' : 'professore'} può prenotare lezioni.
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-72 w-full rounded-md border p-4">
                    <div className="grid gap-4 py-4">
                        {assignableProfessors.length > 0 ? (
                            assignableProfessors.map((profEmail) => (
                                <div key={profEmail} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={`prof-${profEmail}`}
                                        checked={selectedProfessors.includes(profEmail)}
                                        onCheckedChange={(checked) => handleCheckboxChange(profEmail, !!checked)}
                                        // Disable checkbox if it's the user's own email (shouldn't happen with filtering, but safe)
                                        disabled={user?.role === 'professor' && profEmail === user.email}
                                    />
                                    <Label
                                        htmlFor={`prof-${profEmail}`}
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                        {profEmail}
                                    </Label>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-muted-foreground">Nessun altro professore disponibile per l'assegnazione.</p>
                        )}
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Annulla</Button>
                    <Button onClick={handleSaveChanges}>Salva Modifiche</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
