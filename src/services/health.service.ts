interface healthInfo {
    status:string
    timestamp:Date
}

export const checkServerHealth = ():healthInfo => {
    return {
        status:"ok",
        timestamp: new Date()
    }
}