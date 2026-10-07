import { describe, expect, it } from 'vitest'
import { accountName, folderFlavor } from '../../src/utils/collector'

describe('collector path labels', () => {
  it('names accounts from POSIX and Windows collector paths', () => {
    expect(accountName('/wow/_retail_/WTF/Account/ACCOUNT1/SavedVariables/WoWthing_Collector.lua')).toBe('ACCOUNT1')
    expect(accountName('C:\\WoW\\_retail_\\wtf\\account\\12345#1\\SavedVariables\\WoWthing_Collector.lua')).toBe('12345#1')
    expect(accountName('/fixture/collector.lua')).toBe('collector.lua')
  })

  it('reads the game flavor folder', () => {
    expect(folderFlavor('C:\\Games\\World of Warcraft\\_retail_\\')).toBe('_retail_')
    expect(folderFlavor('/Applications/World of Warcraft/_classic_')).toBe('_classic_')
  })
})
