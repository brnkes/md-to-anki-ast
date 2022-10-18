export const getAncestorTrie = () => {
    const root: any = {}

    function add(ids: number[]) {
        let current = root;
        for(const id of ids) {
            current[id] = current[id] || {};
            current = current[id];
        }
    }

    function exists(v: number[]) {
        let current = root;
        for(const vD of v) {
            if(!current[vD]) {
                return false;
            }

            current = current[vD];
        }

        return true;
    }

    function debugPrint() {
        const buf: string[] = [];
        function go(tabs = 0, current = root) {
            for (const e of Object.entries(current)) {
                const log = `${[...Array(tabs)].map(() => "-").join("")}${e[0]}`;
                buf.push(log);

                go(tabs + 1, e[1]);
            }
        }

        go();
        return buf.join("\n");
    }

    return {
        add,
        exists,
        debugPrint
    }
}
