
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
import type { DisplayUser } from '@/types/display-user'; // Import DisplayUser type

interface ManageUserProfessorsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    user: DisplayUser | null; // Accept the DisplayUser type directly
    allProfessors: string[];
    // onSave now just passes the selected emails back to the parent component
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

    // Initialize selected professors based on the user's current assignments
    useEffect(() => {
        if (user && Array.isArray(user.assignedProfessorEmails)) {
             setSelectedProfessors(
                 user.role === 'professor'
                     ? user.assignedProfessorEmails.filter(email => email !== user.email)
                     : user.assignedProfessorEmails
             );
        } else {
            setSelectedProfessors([]);
        }
    }, [user, isOpen]);

    const handleCheckboxChange = (professorEmail: string, checked: boolean) => {
        if (user?.role === 'professor' && professorEmail === user.email) {
             return;
        }
        setSelectedProfessors(prev => {
            if (checked) {
                return [...prev, professorEmail];
            } else {
                return prev.filter(email => email !== professorEmail);
            }
        });
    };

    const handleSaveChanges = () => {
        if (user) {
            // Call the onSave prop passed from AdminInterface, which handles writing data
            onSave(user.email, selectedProfessors);
            // onClose(); // Parent component now handles closing
        }
    };

    // Filter out the current user if they are a professor
    const assignableProfessors = user?.role === 'professor'
        ? allProfessors.filter(profEmail => profEmail !== user.email)
        : allProfessors;

    if (!user || user.role === 'admin') return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
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
