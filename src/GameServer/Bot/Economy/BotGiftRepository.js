'use strict';

// Living Bots: a gift from one background (cold) bot to another, in one transaction:
// Adena (patronage: a rich bot helps a struggling friend or clanmate) or one unworn piece
// of gear (a hand-me-down to someone who will wear it).
//
// It moves item rows the way an AFK trade with a far bot does: the giver's rows through
// afkTradeTakeItemUnsafe, the taker's through the trade credits, then each bot's row is
// fenced (fenceColdInventoryUnsafe: its summary rebuilt from its rows, its revision moved),
// so a background step already under way for either bot rebases on the new rows instead of
// writing over them. Nothing appears or vanishes: what one bag loses the other gains.
// Only between two cold bots: a live bot's bag is its actor's (the main thread's), so a gift
// to or from one is refused here (gift_not_cold) and tried again when both are away.
// The caller publishes the returned rows (EconomyCommit.acceptRow).

module.exports = function ({ one, inTransaction, withCharacterFlushes, fenceColdInventoryUnsafe,
    afkTradeTakeItemUnsafe, afkTradeCreditAdenaUnsafe, afkTradeCreditItemUnsafe }) {
    const cold = (id) => one('SELECT phase FROM bot_life_state WHERE characterId = ?', [id])?.phase === 'cold';

    function gift(label, fromId, toId, move) {
        const from = Number(fromId), to = Number(toId);
        if (!(from > 0) || !(to > 0) || from === to) return Promise.resolve({ ok: false, code: 'gift_invalid' });
        return withCharacterFlushes([from, to], () => inTransaction(() => {
            if (!cold(from) || !cold(to)) return { ok: false, code: 'gift_not_cold' };
            let selfIds;
            try {
                selfIds = move(from, to);
            } catch (error) {
                // The giver's bag moved since the caller looked (afkTradeTakeItemUnsafe): nothing written.
                if (/inventory_item_changed|not_transferable/.test(String(error?.message))) return { ok: false, code: 'gift_changed' };
                throw error;
            }
            return { ok: true, rows: { [from]: fenceColdInventoryUnsafe(from, selfIds), [to]: fenceColdInventoryUnsafe(to, selfIds) } };
        }, label));
    }

    return {
        // amount Adena from one cold bot to another, from a single stack of the giver's.
        giftAdena({ fromId, toId, amount }) {
            const pay = Math.floor(Number(amount) || 0);
            if (!(pay > 0)) return Promise.resolve({ ok: false, code: 'gift_invalid' });
            return gift('living-bots:gift-adena', fromId, toId, (from, to) => {
                afkTradeTakeItemUnsafe(from, null, 57, 0, pay);
                afkTradeCreditAdenaUnsafe(to, pay);
                return [57];
            }).then((result) => (result.ok ? { ...result, amount: pay } : result));
        },
        // One unworn item row (itemId: its items.id) from one cold bot to another, with its enchant.
        giftItem({ fromId, toId, itemId, selfId, enchant = 0 }) {
            return gift('living-bots:gift-item', fromId, toId, (from, to) => {
                const row = afkTradeTakeItemUnsafe(from, Number(itemId), Number(selfId), Number(enchant) || 0, 1);
                afkTradeCreditItemUnsafe(to, { selfId: row.selfId, name: row.name, enchant: row.enchant,
                    slot: row.slot, stackable: 0, petData: row.petData }, 1);
                return [Number(row.selfId)];
            });
        }
    };
};
