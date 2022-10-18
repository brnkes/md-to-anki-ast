import Denque from "denque";

export const breadthFirstSearch = async <T>(
    root: T,
    visitElement: (element: T, enqueue: (e: T) => void) => Promise<void>
) => {
    const q = new Denque([root]);

    for(let nextElement = q.shift(); nextElement !== undefined; nextElement = q.shift()) {
        await visitElement(nextElement, (elementToEnqueue) => q.push(elementToEnqueue));
    }
}