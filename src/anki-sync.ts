import {CardIdProps, CardResult} from "./process_markdown_note.js";

const ANKI_ENDPOINT = 'http://localhost:8765';

class AnkiClient {
    async notesInfo(noteId: string) {
        await fetch(ANKI_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({
                action: "notesInfo",
                version: 6,
                params: {
                    "notes": [noteId]
                }
            })
        })
    }

    async addNote (
        front: string,
        back: string,
        modelName = "Basic",
        deckName = "MDTest"
    ) {
        const result = await fetch(ANKI_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({
                action: "addNote",
                version: 6,
                params: {
                    note: {
                        deckName,
                        modelName,
                        fields: {
                            "Front": front,
                            "Back": back
                        },
                        "options": {
                            "allowDuplicate": false,
                        }
                    }
                }
            })
        });

        return await result.json();
    }
}

export const syncToAnki = async (
    cards: (CardResult & CardIdProps)[]
) => {
    const ankiClient = new AnkiClient();

    for(const card of cards) {
        const { front, back, id } = card;

        if(id !== null) {
            const noteInfo = await ankiClient.notesInfo(id);
            console.log("Exists ?", JSON.stringify(noteInfo));
        }

        const response = await ankiClient.addNote(front, back);

        if(response.error) {
            console.error(response.error);
        }

        else if(typeof response.result !== 'number') {
            console.error("Unexpected result type ?", response.result);
        }

        card.id = card.id || response.result;
    }
}