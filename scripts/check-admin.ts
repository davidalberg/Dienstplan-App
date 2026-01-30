import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkAdmin() {
    const admin = await prisma.user.findUnique({
        where: { email: 'david.alberg@assistenzplus.de' },
        select: { email: true, name: true, role: true }
    })

    console.log('\nAdmin user:', admin || 'NOT FOUND')

    if (admin) {
        console.log('✅ Admin credentials are correctly set up!')
        console.log('   Email:', admin.email)
        console.log('   Name:', admin.name)
        console.log('   Role:', admin.role)
        console.log('\nYou can log in with: david.alberg@assistenzplus.de / password123')
    }

    await prisma.$disconnect()
}

checkAdmin().catch(console.error)
