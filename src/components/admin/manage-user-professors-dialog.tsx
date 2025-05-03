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
import { cn } from "@/lib/utils"; // Import cn utility

interface ManageUserProfessorsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    user: DisplayUser | null;
    allProfessors: string[];
    onSave: (userEmail: string, assignedEmails: string[]) => void;
    isLoading?: boolean; // Optional loading state prop
}

export function ManageUserProfessorsDialog({
    isOpen,
    onClose,
    user,
    allProfessors,
    onSave,
    isLoading = false, // Default to false if not provided
}: ManageUserProfessorsDialogProps) {
    const [selectedProfessors, setSelectedProfessors] = useState<string[]>([]);

    useEffect(() => {
        // Initialize selected professors based on the user's current assignments
        // Filter out the user's own email if they are a professor during initialization
        if (user && Array.isArray(user.assignedProfessorEmails)) { // Corrected property name
            setSelectedProfessors(
                user.role === 'professor'
                    ? user.assignedProfessorEmails.filter(email => email !== user.email) // Corrected property name
                    : user.assignedProfessorEmails // Corrected property name
            );
        } else {
            setSelectedProfessors([]);
        }
    }, [user, isOpen]);

    const handleCheckboxChange = (professorEmail: string, checked: boolean) => {
        // Prevent selecting the user's own email if they are a professor
        if (user?.role === 'professor' && professorEmail === user.email) {
            return; // Do nothing if trying to select self
        }
        setSelectedProfessors(prev => checked ? [...prev, professorEmail] : prev.filter(email => email !== professorEmail));
    };

    const handleSaveChanges = () => {
        if (user && !isLoading) { // Prevent saving if already loading
             // Filter out the user's own email before saving if they are a professor
            const emailsToSave = user.role === 'professor'
                ? selectedProfessors.filter(email => email !== user.email)
                : selectedProfessors;
            onSave(user.email, emailsToSave);
        }
    };

    // Filter out the current user from the list if they are a professor
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
                        Seleziona i professori {user.role === 'student' ? 'da cui questo studente può prenotare lezioni' : 'che questo professore può prenotare o da cui può essere prenotato (escluso sé stesso)'}.
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
                                        disabled={isLoading} // Disable all checkboxes during load/save
                                    />
                                    <Label
                                        htmlFor={`prof-${profEmail}`}
                                        className={cn("text-sm font-medium leading-none", isLoading && "opacity-50")} // Dim label when loading
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
                    <Button variant="outline" onClick={onClose} disabled={isLoading}>Annulla</Button>
                    <Button onClick={handleSaveChanges} disabled={isLoading}>
                        {isLoading ? 'Salvataggio...' : 'Salva Modifiche'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

