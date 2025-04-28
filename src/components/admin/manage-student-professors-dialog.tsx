
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

interface ManageStudentProfessorsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    student: { email: string; assignedProfessorEmails?: string[] | null }; // Simplified student prop
    allProfessors: string[];
    onSave: (studentEmail: string, assignedEmails: string[]) => void;
}

export function ManageStudentProfessorsDialog({
    isOpen,
    onClose,
    student,
    allProfessors,
    onSave,
}: ManageStudentProfessorsDialogProps) {
    const [selectedProfessors, setSelectedProfessors] = useState<string[]>([]);

    // Initialize selected professors based on the student's current assignments when the dialog opens
    useEffect(() => {
        if (student && Array.isArray(student.assignedProfessorEmails)) {
            setSelectedProfessors(student.assignedProfessorEmails);
        } else {
            setSelectedProfessors([]); // Reset if no assignments or invalid data
        }
    }, [student, isOpen]); // Re-run when the student or isOpen changes

    const handleCheckboxChange = (professorEmail: string, checked: boolean) => {
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
        if (student) {
            onSave(student.email, selectedProfessors);
        }
    };

    if (!student) return null; // Don't render if no student is selected

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Gestisci Professori per {student.email}</DialogTitle>
                    <DialogDescription>
                        Seleziona i professori a cui questo studente può prenotare lezioni.
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-72 w-full rounded-md border p-4">
                    <div className="grid gap-4 py-4">
                        {allProfessors.length > 0 ? (
                            allProfessors.map((profEmail) => (
                                <div key={profEmail} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={`prof-${profEmail}`}
                                        checked={selectedProfessors.includes(profEmail)}
                                        onCheckedChange={(checked) => handleCheckboxChange(profEmail, !!checked)}
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
                            <p className="text-sm text-muted-foreground">Nessun professore disponibile.</p>
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
